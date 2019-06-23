export const apiServerAddress =
  process.env.API_SERVER_ADDRESS || 'http://localhost:8081';

export const ndidApiCallbackIp =
  process.env.NDID_API_CALLBACK_IP || 'localhost';
export const ndidApiCallbackPort = process.env.NDID_API_CALLBACK_PORT || 5003;

export const DATA_BASE_PATH = process.env.DATA_BASE_PATH || './data';

export const minAAL = process.env.MIN_AAL || 2.2;
export const minIAL = process.env.MIN_IAL || 2.3;
export const defaultDelay = process.env.DELAY ? Math.max(parseInt(process.env.DEFAULT_DELAY , 10), 0) : 0;