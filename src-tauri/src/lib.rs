#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let log_level = if cfg!(debug_assertions) {
    log::LevelFilter::Debug
  } else {
    log::LevelFilter::Info
  };

  tauri::Builder::default()
    .setup(|app| {
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log_level)
          .build(),
      )?;

      log::info!("PhotoShow Tauri app setup complete");
      log::info!("Logging initialized");
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
