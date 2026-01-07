import WebGPU from 'three/addons/capabilities/WebGPU.js';

/**
 * Check if WebGPU is available and show error message if not
 */
export function checkWebGPUSupport(): void {
  if (!WebGPU.isAvailable()) {
    const errorMessage = WebGPU.getErrorMessage();
    document.body.appendChild(errorMessage);
    throw new Error('WebGPU not supported');
  }
}

