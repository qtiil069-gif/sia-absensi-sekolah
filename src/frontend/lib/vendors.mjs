import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { BrowserQRCodeReader } from '@zxing/browser';
import pdfMake from 'pdfmake/build/pdfmake.js';
import fonts from 'pdfmake/build/vfs_fonts.js';
import ExcelJS from 'exceljs';

pdfMake.addVirtualFileSystem(fonts);
window.SIA.vendors = { QRCode, jsQR, BrowserQRCodeReader, pdfMake, ExcelJS };
