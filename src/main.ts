import '@adam0white/lab-kit/stage.css';
import './ui/style.css';
import { _debug, start } from './ui/app.ts';
import { fileMode } from './ui/lab.ts';

if (import.meta.env.DEV) (window as unknown as { __st: typeof _debug }).__st = _debug;
if (fileMode !== 'invalid') void start();
