use serde_json::Value as JsonValue;
use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

/// Exécute un lot d'écritures dans UNE transaction SQLite, sur UNE seule
/// connexion du pool (BEGIN → statements → COMMIT, rollback automatique).
///
/// Indispensable : le plugin SQL utilise un pool sqlx multi-connexions,
/// donc des `BEGIN`/`COMMIT` envoyés via `execute()` depuis le JS peuvent
/// atterrir sur des connexions différentes (→ « database is locked »,
/// écritures hors transaction). Règle n°6 : tout ou rien.
#[tauri::command]
async fn execute_transaction(
    app: tauri::AppHandle,
    db: String,
    statements: Vec<(String, Vec<JsonValue>)>,
) -> Result<(), String> {
    let instances = app.state::<DbInstances>();
    let instances = instances.0.read().await;
    let pool = instances
        .get(&db)
        .ok_or_else(|| format!("Base non chargée : {db}"))?;

    #[allow(irrefutable_let_patterns)]
    let DbPool::Sqlite(pool) = pool
    else {
        return Err("Transactions : SQLite uniquement".to_string());
    };

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // La connexion de la transaction attend son tour au lieu d'échouer
    // immédiatement si un autre writer est actif.
    sqlx::query("PRAGMA busy_timeout=5000")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for (sql, values) in statements {
        let mut query = sqlx::query(&sql);
        // Même convention de binding que tauri-plugin-sql (wrapper.rs)
        for value in values {
            if value.is_null() {
                query = query.bind(None::<JsonValue>);
            } else if value.is_string() {
                query = query.bind(value.as_str().unwrap().to_owned());
            } else if let Some(number) = value.as_number() {
                query = query.bind(number.as_f64().unwrap_or_default());
            } else {
                query = query.bind(value);
            }
        }
        query.execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Hache un PIN avec bcrypt (coût par défaut : 12).
#[tauri::command]
fn hash_pin(pin: String) -> Result<String, String> {
    bcrypt::hash(&pin, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())
}

/// Vérifie un PIN contre un hash bcrypt.
#[tauri::command]
fn verify_pin(pin: String, hash: String) -> Result<bool, String> {
    bcrypt::verify(&pin, &hash).map_err(|e| e.to_string())
}

/// Enregistre un export CSV dans le dossier Téléchargements de
/// l'utilisateur et retourne le chemin complet. Le WebView ne gère
/// pas le téléchargement `<a download>` : l'écriture passe par Rust.
#[tauri::command]
fn save_report_csv(app: tauri::AppHandle, filename: String, content: String) -> Result<String, String> {
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("Dossier Téléchargements introuvable : {e}"))?;

    // Nettoyage du nom de fichier (caractères interdits sous Windows)
    let safe: String = filename
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();

    let path = dir.join(safe);
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Prépare le dossier de sauvegardes (app_data/backups),
/// purge les fichiers de plus de 30 jours et retourne le chemin.
/// La copie elle-même est faite côté TS via `VACUUM INTO`.
#[tauri::command]
fn prepare_backup_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Rotation : suppression des sauvegardes > 30 jours
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(30 * 24 * 3600);
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "db").unwrap_or(false) {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        if modified < cutoff {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }

    Ok(dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "Schéma initial complet (16 tables)",
            sql: include_str!("../../src/core/db/migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default();

    // Instance unique : un second lancement ramène la fenêtre existante
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }));
    }

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pos-jiaby.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hash_pin,
            verify_pin,
            prepare_backup_dir,
            execute_transaction,
            save_report_csv
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de JIABY POS");
}
