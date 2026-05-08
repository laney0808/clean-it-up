import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Driver, Omni } from "@omnimedia/omnitool"
import { BrowserRouter } from './router';
import { OmniProvider } from './omni/OmniContext';

const workerUrl = new URL("/driver.worker.bundle.min.js", window.location.href)

Driver.setup({ workerUrl }).then(driver => {
  const omni = new Omni(driver)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <OmniProvider omni={omni}>
          <App />
        </OmniProvider>
      </BrowserRouter>
    </StrictMode>
  )
})

// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// );
