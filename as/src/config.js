export const ndidApiCallbackIp =
  process.env.NDID_API_CALLBACK_IP || 'localhost';
export const ndidApiCallbackPort = process.env.NDID_API_CALLBACK_PORT || 5003;

export const useExternalCryptoService =
  process.env.USE_EXTERNAL_CRYPTO_SERVICE === 'true' ? true : false;

export const minAAL = process.env.MIN_AAL || 2.2
export const minIAL = process.env.MIN_IAL || 2.3