// mini-server.js
const express = require('express');

const app = express();
app.use(express.json());

app.post('/test', (req, res) => {
  console.log('✅ /test hit, body:', req.body);

  const { prompt } = req.body || {};

  return res.json({
    debug: true,
    route: '/test',
    promptReceived: prompt || null,
    nailDesign: {
      shape: 'debug_shape',
      length: 'debug_length',
      templateId: 'debug_template',
      base: {
        type: 'solid',
        colorName: 'Debug Pink',
        colorFamily: 'pink',
        colorRef: 'color_debug_pink',
        finish: 'glossy',
        opacity: 1,
        hexColor: '#FF00AA',
        gradient: null,
        visible: true,
      },
      fingers: [
        {
          base: {
            type: 'solid',
            colorName: 'Debug Pink',
            colorFamily: 'pink',
            colorRef: 'color_debug_pink',
            finish: 'glossy',
            opacity: 1,
            hexColor: '#FF00AA',
            gradient: null,
            visible: true,
          },
          layers: [],
          charms: [],
          effects: [],
        },
      ],
    },
  });
});

const PORT = 4100;
app.listen(PORT, () => {
  console.log(`✅ mini-server listening on http://localhost:${PORT}`);
});
