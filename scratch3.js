const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const missing = [
  "set_agreed_flag",
  "delete_temp_file",
  "upload_image_to_imgbb",
  "close_imgbb_window",
  "spawn_capture_to_input",
  "stop_stt",
  "start_stt",
  "download_ocr_model",
  "get_model_path",
  "read_clipboard_text"
];

const rendererFiles = walk('./apps/renderer/src');
rendererFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  missing.forEach(cmd => {
    if (content.includes(`"${cmd}"`) || content.includes(`'${cmd}'`)) {
      console.log(`Found ${cmd} in ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.includes(`"${cmd}"`) || line.includes(`'${cmd}'`)) {
          console.log(`  Line ${i+1}: ${line.trim()}`);
        }
      });
    }
  });
});
