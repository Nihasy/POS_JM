use tauri_plugin_sql::{Migration, MigrationKind};

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

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pos-jiaby.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de JIABY POS");
}
