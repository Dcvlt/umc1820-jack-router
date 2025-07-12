// UMC1820 Configuration - Optimized for your setup
const DEVICE_CONFIG = {
  inputs: {
    input_1: {
      value: 'system:capture_1',
      label: 'Input 1 (Guitar/Bass)',
    },
    input_2: {
      value: 'system:capture_2',
      label: 'Input 2 (Microphone)',
    },
    input_3: {
      value: 'system:capture_3',
      label: 'Input 3 (Osmose Left)',
      group: 'osmose',
    },
    input_4: {
      value: 'system:capture_4',
      label: 'Input 4 (Osmose Right)',
      group: 'osmose',
    },
    input_5: {
      value: 'system:capture_5',
      label: 'Input 5 (Micromonsta 2 Left)',
      group: 'micromonsta',
    },
    input_6: {
      value: 'system:capture_6',
      label: 'Input 6 (Micromonsta 2 Right)',
      group: 'micromonsta',
    },
    input_7: {
      value: 'system:capture_7',
      label: 'Input 7 (Pedalboard Return Left)',
      group: 'pedalboard input',
    },
    input_8: {
      value: 'system:capture_8',
      label: 'Input 8 (Pedalboard Return Right)',
      group: 'pedalboard input',
    },
    spdif_in_l: {
      value: 'system:capture_9',
      label: 'S/PDIF Input Left (DX3 Left)',
      group: 'dx3',
    },
    spdif_in_r: {
      value: 'system:capture_10',
      label: 'S/PDIF Input Right (DX3 Right)',
      group: 'dx3',
    },
  },
  outputs: {
    main_out_l: {
      value: 'system:playback_1',
      label: 'Main Out Left (Headphones via PHONES 1-2)',
      group: 'headphones',
    },
    main_out_r: {
      value: 'system:playback_2',
      label: 'Main Out Right (Headphones via PHONES 1-2)',
      group: 'headphones',
    },
    line_out_3: {
      value: 'system:playback_3',
      label: 'Line Out 3 (Macbook Left)',
      group: 'macbook output',
    },
    line_out_4: {
      value: 'system:playback_4',
      label: 'Line Out 4 (Macbook Right)',
      group: 'macbook output',
    },
    line_out_5: {
      value: 'system:playback_5',
      label: 'Line Out 5 (Pedalboard Send Left)',
      group: 'pedalboard output',
    },
    line_out_6: {
      value: 'system:playback_6',
      label: 'Line Out 6 (Pedalboard Send Right)',
      group: 'pedalboard output',
    },
    line_out_7: {
      value: 'system:playback_7',
      label: 'Line Out 7 (Future monitors Left)',
      group: 'monitors',
    },
    line_out_8: {
      value: 'system:playback_8',
      label: 'Line Out 8 (Future monitors Right)',
      group: 'monitors',
    },
    line_out_9: {
      value: 'system:playback_9',
      label: 'Line Out 9 (Future use)',
      group: 'future use',
    },
    line_out_10: {
      value: 'system:playback_10',
      label: 'Line Out 10 (Future use)',
      group: 'future use',
    },
    // Note: Headphone outputs are hardware-controlled via PHONES source selector
    // PHONES 1-2 position: Routes main_out_l/r to headphones
    // PHONES 3-4 position: Routes line_out_3/4 to headphones
    spdif_out_l: {
      value: 'system:playback_11',
      label: 'S/PDIF Out Left (Future use)',
      group: 'future SPDIF',
    },
    spdif_out_r: {
      value: 'system:playback_12',
      label: 'S/PDIF Out Right (Future use)',
      group: 'future SPDIF',
    },
  },
};

// Updated routing presets for your specific use cases
const ROUTING_PRESETS = {
  PC_mode: {
    name: 'PC Mode',
    description: 'Only PC outputs to headphones',
    connections: [
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },
  recording_mode: {
    name: 'Recording Mode',
    description: 'All instruments to headphones and recording destinations',
    connections: [
      // Send everything to headphones for monitoring
      { from: 'input_1', to: 'main_out_l' }, // Guitar/Bass to headphones
      { from: 'input_2', to: 'main_out_l' }, // Mic to headphones (mono to both)
      { from: 'input_2', to: 'main_out_r' }, // Mic to headphones (mono to both)
      { from: 'input_3', to: 'main_out_l' }, // Osmose L to headphones
      { from: 'input_4', to: 'main_out_r' }, // Osmose R to headphones
      { from: 'input_5', to: 'main_out_l' }, // Micromonsta 2 L to headphones
      { from: 'input_6', to: 'main_out_r' }, // Micromonsta 2 R to headphones
      { from: 'input_7', to: 'main_out_l' }, // Pedalboard return L to headphones
      { from: 'input_8', to: 'main_out_r' }, // Pedalboard return R to headphones

      // Send to Macbook for recording
      { from: 'input_1', to: 'line_out_3' }, // Guitar/Bass to Mac
      { from: 'input_2', to: 'line_out_4' }, // Mic to Mac
      { from: 'input_3', to: 'line_out_3' }, // Osmose L to Mac
      { from: 'input_4', to: 'line_out_4' }, // Osmose R to Mac
      { from: 'input_5', to: 'line_out_3' }, // Micromonsta 2 L to Mac
      { from: 'input_6', to: 'line_out_4' }, // Micromonsta 2 R to Mac

      // Also send PC outputs to headphones
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },

  practice_mode: {
    name: 'Practice Mode',
    description: 'Guitar through pedalboard, synths and mic to headphones',
    connections: [
      // Guitar to pedalboard
      { from: 'input_1', to: 'line_out_5' }, // Guitar to pedalboard L
      { from: 'input_1', to: 'line_out_6' }, // Guitar to pedalboard R (mono to stereo)

      // Pedalboard return to headphones
      { from: 'input_7', to: 'main_out_l' }, // Pedalboard return L
      { from: 'input_8', to: 'main_out_r' }, // Pedalboard return R

      // Direct to headphones
      { from: 'input_2', to: 'main_out_l' }, // Mic to headphones
      { from: 'input_2', to: 'main_out_r' }, // Mic to headphones
      { from: 'input_3', to: 'main_out_l' }, // Osmose L
      { from: 'input_4', to: 'main_out_r' }, // Osmose R

      // Also send PC outputs to headphones
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },

  mac_recording: {
    name: 'Mac Recording',
    description: 'Route all inputs to Mac for recording',
    connections: [
      // Mix all inputs to Mac stereo pair
      { from: 'input_1', to: 'line_out_3' }, // Guitar/Bass to Mac L
      { from: 'input_2', to: 'line_out_3' }, // Mic to Mac L
      { from: 'input_3', to: 'line_out_3' }, // Osmose L to Mac L
      { from: 'input_4', to: 'line_out_4' }, // Osmose R to Mac R
      { from: 'input_5', to: 'line_out_3' }, // Micromonsta 2 L to Mac L
      { from: 'input_6', to: 'line_out_4' }, // Micromonsta 2 R to Mac R

      // Also send to headphones for monitoring
      { from: 'input_1', to: 'main_out_l' },
      { from: 'input_2', to: 'main_out_l' },
      { from: 'input_2', to: 'main_out_r' },
      { from: 'input_3', to: 'main_out_l' },
      { from: 'input_4', to: 'main_out_r' },
      { from: 'input_5', to: 'main_out_l' },
      { from: 'input_6', to: 'main_out_r' },

      // Also send PC outputs to headphones
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },

  monitoring_only: {
    name: 'Monitor Only',
    description: 'All inputs to headphones for monitoring',
    connections: [
      { from: 'input_1', to: 'main_out_l' }, // Guitar/Bass
      { from: 'input_2', to: 'main_out_l' }, // Mic (mono to both)
      { from: 'input_2', to: 'main_out_r' }, // Mic (mono to both)
      { from: 'input_3', to: 'main_out_l' }, // Osmose L
      { from: 'input_4', to: 'main_out_r' }, // Osmose R
      { from: 'input_5', to: 'main_out_l' }, // Micromonsta 2 L
      { from: 'input_6', to: 'main_out_r' }, // Micromonsta 2 R
      { from: 'input_7', to: 'main_out_l' }, // Pedalboard return L
      { from: 'input_8', to: 'main_out_r' }, // Pedalboard return R

      // Also send PC outputs to headphones
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },

  synth_only: {
    name: 'Synth Only',
    description: 'Only synths (Osmose + Micromonsta 2) to headphones',
    connections: [
      { from: 'input_3', to: 'main_out_l' }, // Osmose L
      { from: 'input_4', to: 'main_out_r' }, // Osmose R
      { from: 'input_5', to: 'main_out_l' }, // Micromonsta 2 L
      { from: 'input_6', to: 'main_out_r' }, // Micromonsta 2 R

      // Also send PC outputs to headphones
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },

  guitar_pedalboard_loop: {
    name: 'Guitar Pedalboard Loop',
    description: 'Guitar through pedalboard with return',
    connections: [
      { from: 'input_1', to: 'line_out_5' }, // Guitar to pedalboard L
      { from: 'input_1', to: 'line_out_6' }, // Guitar to pedalboard R
      { from: 'input_7', to: 'main_out_l' }, // Pedalboard return L
      { from: 'input_8', to: 'main_out_r' }, // Pedalboard return R

      // Also send PC outputs to headphones
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },

  osmose_pedalboard_loop: {
    name: 'Osmose Pedalboard Loop',
    description: 'Osmose through pedalboard with return',
    connections: [
      { from: 'input_3', to: 'line_out_5' }, // Osmose to pedalboard L
      { from: 'input_4', to: 'line_out_6' }, // Osmose to pedalboard R
      { from: 'input_7', to: 'main_out_l' }, // Pedalboard return L
      { from: 'input_8', to: 'main_out_r' }, // Pedalboard return R

      // Also send PC outputs to headphones
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },

  micromonsta_pedalboard_loop: {
    name: 'Micromonsta Pedalboard Loop',
    description: 'Micromonsta through pedalboard with return',
    connections: [
      { from: 'input_5', to: 'line_out_5' }, // Micromonsta 2 L to pedalboard L
      { from: 'input_6', to: 'line_out_6' }, // Micromonsta 2 R to pedalboard R
      { from: 'input_7', to: 'main_out_l' }, // Pedalboard return L
      { from: 'input_8', to: 'main_out_r' }, // Pedalboard return R

      // Also send PC outputs to headphones
      { from: 'spdif_in_l', to: 'main_out_l' }, // DX3 windows input L
      { from: 'spdif_in_r', to: 'main_out_r' }, // DX3 windows input R
    ],
  },
};

// Export using CommonJS syntax
module.exports = {
  DEVICE_CONFIG,
  ROUTING_PRESETS,
};
