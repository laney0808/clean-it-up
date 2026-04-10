self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Match the action defined in manifest.json
  if (event.request.method === 'POST' && url.pathname.endsWith('/load-zip')) {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const zipFile = formData.get('project_zip');
      
      const cache = await caches.open('viewer-temp-storage');
      await cache.put('/shared.zip', new Response(zipFile));

      // Redirect back to viewer home with a flag
      return Response.redirect('./index.html?shared=1', 303);
    })());
  }
});