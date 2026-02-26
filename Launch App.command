#!/bin/bash
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")"
npm run tauri dev
