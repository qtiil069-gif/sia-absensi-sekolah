import pdfMake from 'pdfmake/build/pdfmake.js';
import fonts from 'pdfmake/build/vfs_fonts.js';

pdfMake.addVirtualFileSystem(fonts);
Object.assign(window.SIA.vendors, { pdfMake });
