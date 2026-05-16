use wasm_bindgen::prelude::*;

use crate::error_to_js;

#[wasm_bindgen]
pub struct PkDecryption {
    inner: vodozemac::pk_encryption::PkDecryption,
}

#[wasm_bindgen]
impl PkDecryption {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: vodozemac::pk_encryption::PkDecryption::new(),
        }
    }

    pub fn from_key(secret_key: &[u8]) -> Result<PkDecryption, JsError> {
        let bytes: [u8; 32] = secret_key
            .try_into()
            .map_err(error_to_js)?;

        let secret = vodozemac::Curve25519SecretKey::from_slice(&bytes);

        Ok(Self {
            inner: vodozemac::pk_encryption::PkDecryption::from_key(secret),
        })
    }

    pub fn decrypt(
        &self,
        ciphertext: &[u8],
        mac: &[u8],
        ephemeral_key: &[u8],
    ) -> Result<Vec<u8>, JsError> {
        let ephemeral_key: [u8; 32] = ephemeral_key
            .try_into()
            .map_err(|_| JsError::new("Expected 32-byte ephemeral key"))?;

        let message = vodozemac::pk_encryption::Message {
            ciphertext: ciphertext.to_vec(),
            mac: mac.to_vec(),
            ephemeral_key: vodozemac::Curve25519PublicKey::from(ephemeral_key),
        };

        self.inner
            .decrypt(&message)
            .map_err(|e| JsError::new(&format!("{e:?}")))
    }
}