import {Eta} from "eta"
import * as path from "node:path";
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const eta = new Eta({views: path.join(__dirname, "../../template")})
