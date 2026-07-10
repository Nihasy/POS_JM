use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

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
            prepare_backup_dir
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de JIABY POS");
}
