use thiserror::Error;

/// Application error types
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Invalid duration: must be between 1 and 120 minutes")]
    InvalidDuration,

    #[error("Invalid opacity: must be between 0 and 100")]
    InvalidOpacity,

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Tauri error: {0}")]
    TauriError(String),

    #[error("Failed to import configuration: {0}")]
    ImportFailed(String),

    #[error("Failed to export configuration: {0}")]
    ExportFailed(String),

    #[error("Configuration validation failed: {0}")]
    ValidationError(String),

    #[error("Audio error: {0}")]
    AudioError(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.to_string()
    }
}

/// Result type alias for application operations
pub type AppResult<T> = Result<T, AppError>;
