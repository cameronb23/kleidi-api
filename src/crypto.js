import CryptoJS, { AES } from 'crypto-js';

let key = null;

export const setupCrypt = (encryptionKey) => {
  key = encryptionKey;
};

export const encryptData = (data) => {
  if (data == null || data === '') return null;
  return AES.encrypt(data, key).toString();
};

export const decryptData = (data) => {
  if (data == null || data === '') return null;
  const decrypted = AES.decrypt(data, key);
  const text = decrypted.toString(CryptoJS.enc.Utf8);
  return text;
};
