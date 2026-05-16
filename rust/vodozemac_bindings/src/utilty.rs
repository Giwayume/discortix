use wasm_bindgen::prelude::*;

use vodozemac::Ed25519PublicKey;
use vodozemac::Ed25519Signature;
use wasm_bindgen::JsError;
use wasm_bindgen::JsValue;

#[wasm_bindgen]
pub fn verify_signature(key: &str, message: &[u8], signature: &str) -> Result<(), JsValue> {
    let public_key: Ed25519PublicKey =
        Ed25519PublicKey::from_base64(key).map_err(|error| JsError::new(&error.to_string()))?;
    let signatre_obj: Ed25519Signature = Ed25519Signature::from_base64(signature)
        .map_err(|error| JsError::new(&error.to_string()))?;
    public_key
        .verify(message, &signatre_obj)
        .map_err(|error| JsError::new(&error.to_string()))?;
    Ok(())
}
