// testTemplates.js

const { getCollection } = require('./src/data/mockFirestore');

console.log('🧪 Running testTemplates.js...');
console.log('cwd:', process.cwd());

const templates = getCollection('finger_templates');

console.log('Templates type:', Array.isArray(templates) ? 'array' : typeof templates);
console.log('Templates length:', Array.isArray(templates) ? templates.length : 'n/a');

if (Array.isArray(templates) && templates.length > 0) {
  console.log('✅ First template id:', templates[0].id);
  console.log('✅ First template shape/length:', templates[0].shape, templates[0].length);
} else {
  console.log('❌ No templates loaded from finger_templates.json');
}
