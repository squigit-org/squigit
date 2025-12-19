use anyhow::Result;

pub struct HotkeyManager;

impl HotkeyManager {
    pub fn new() -> Self {
        Self
    }

    pub fn register(&self, shortcut: &str) -> Result<()> {
        println!("Registering global hotkey: {}", shortcut);
        // Implementation will go here (using Windows hooks, X11, or Cocoa)
        Ok(())
    }
}
