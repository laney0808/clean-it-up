import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Driver, Omni } from "@omnimedia/omnitool"

const workerUrl = new URL("/driver.worker.bundle.min.js", window.location.href)

Driver.setup({ workerUrl }).then(driver => {
  const omni = new Omni(driver)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App omni={omni} />
    </StrictMode>
  )
})

// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// );
