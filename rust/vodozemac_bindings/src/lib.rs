#![allow(clippy::new_without_default)]

mod account;
mod group_sessions;
mod pk_encryption;
mod sas;
mod session;
mod utilty;
pub use account::Account;
pub use sas::{EstablishedSas, Sas, SasBytes};
pub use session::Session;
pub use utilty::verify_signature;

use wasm_bindgen::prelude::*;

fn error_to_js(error: impl std::error::Error) -> JsError {
    JsError::new(&error.to_string())
}

// Called when the Wasm module is instantiated
#[wasm_bindgen(start)]
fn main() -> Result<(), JsValue> {
    Ok(())
}