import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { BrowserQRCodeReader } from '@zxing/browser';
Object.assign(window.SIA.vendors, { QRCode, jsQR, BrowserQRCodeReader });
