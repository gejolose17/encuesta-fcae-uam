/**
 * Cloudflare Pages Function: POST & OPTIONS & DELETE /api/delete
 * Alias de eliminación para uno o varios registros docentes
 */

import { onRequestOptions, onRequestPost, onRequestDelete } from './eliminar-docentes.js';

export { onRequestOptions, onRequestPost, onRequestDelete };
