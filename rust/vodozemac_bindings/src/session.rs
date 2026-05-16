use vodozemac::{base64_decode, base64_encode};
use wasm_bindgen::prelude::*;

use crate::error_to_js;

#[wasm_bindgen(getter_with_clone)]
pub struct EncryptedOlmMessage {
    pub ciphertext: String,
    pub message_type: usize,
}

#[wasm_bindgen]
pub struct Session {
    pub(super) inner: vodozemac::olm::Session,
}

#[wasm_bindgen]
impl Session {
    pub fn pickle(&self, pickle_key: &[u8]) -> Result<String, JsValue> {
        let pickle_key: &[u8; 32] = pickle_key
            .try_into()
            .map_err(|_| JsError::new("Invalid pickle key length, expected 32 bytes"))?;

        Ok(self.inner.pickle().encrypt(pickle_key))
    }

    pub fn from_pickle(pickle: &str, pickle_key: &[u8]) -> Result<Session, JsValue> {
        let pickle_key: &[u8; 32] = pickle_key
            .try_into()
            .map_err(|_| JsError::new("Invalid pickle key length, expected 32 bytes"))?;
        let pickle = vodozemac::olm::SessionPickle::from_encrypted(pickle, pickle_key)
            .map_err(error_to_js)?;

        let session = vodozemac::olm::Session::from_pickle(pickle);

        Ok(Self { inner: session })
    }

    pub fn from_libolm_pickle(pickle: &str, pickle_key: &[u8]) -> Result<Session, JsValue> {
        let session =
            vodozemac::olm::Session::from_libolm_pickle(pickle, pickle_key).map_err(error_to_js)?;

        Ok(Self { inner: session })
    }

    #[wasm_bindgen(getter)]
    pub fn session_id(&self) -> String {
        self.inner.session_id()
    }

    pub fn session_matches(&self, message_type: usize, ciphertext: &str) -> bool {
        let decoded = base64_decode(ciphertext);
        if let Err(_err) = decoded {
            return false;
        }

        let message = vodozemac::olm::OlmMessage::from_parts(message_type, &decoded.unwrap());

        match message {
            Ok(m) => {
                if let vodozemac::olm::OlmMessage::PreKey(m) = m {
                    self.inner.session_keys() == m.session_keys()
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    }

    pub fn encrypt(&mut self, plaintext: &[u8]) -> EncryptedOlmMessage {
        match self.inner.encrypt(plaintext) {
            Ok(encrypted) => {
                let (message_type, ciphertext) = encrypted.to_parts();

                EncryptedOlmMessage {
                    ciphertext: base64_encode(ciphertext),
                    message_type,
                }
            }
            Err(_) => {
                EncryptedOlmMessage {
                    ciphertext: String::new(),
                    message_type: 0,
                }
            }
        }
        
    }

    pub fn decrypt(&mut self, message_type: usize, ciphertext: &str) -> Result<Vec<u8>, JsValue> {
        let decoded: Vec<u8> = base64_decode(ciphertext).map_err(error_to_js)?;
        let message =
            vodozemac::olm::OlmMessage::from_parts(message_type, &decoded).map_err(error_to_js)?;

        Ok(self.inner.decrypt(&message).map_err(error_to_js)?)
    }

    pub fn has_received_message(&self) -> bool {
        self.inner.has_received_message()
    }
}
