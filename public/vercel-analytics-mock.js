// Mock for Vercel Analytics script
// This provides a full no-op implementation to prevent errors when the original script is missing
(function() {
  console.info('Using Vercel Analytics mock implementation');
  
  // Define the analytics object with all expected methods
  window.va = function(...args) {
    // No-op function that logs in development but does nothing in production
    if (process.env.NODE_ENV !== 'production') {
      console.debug('Vercel Analytics mock called with:', args);
    }
    return window.va;
  };

  // Define all the methods Vercel Analytics might use
  const methods = [
    'track', 
    'identify', 
    'page', 
    'event', 
    'init', 
    'beforeSend', 
    'setAnonymousId',
    'middleware'
  ];
  
  methods.forEach(method => {
    window.va[method] = function(...args) {
      // No-op function
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`Vercel Analytics mock: ${method} called with:`, args);
      }
      return window.va;
    };
  });

  // Set a flag to indicate we're using the mock
  window.va.isMock = true;
  
  // Create a global error handler to catch any Vercel Analytics related errors
  window.addEventListener('error', function(event) {
    if (event.filename && 
        (event.filename.includes('vercel') || 
         event.filename.includes('insights') || 
         event.filename.includes('analytics'))) {
      // Prevent the error from showing in console
      event.preventDefault();
      console.debug('Vercel Analytics related error prevented');
      return true;
    }
    return false;
  }, true);
})(); 