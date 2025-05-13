// This is a no-operation script that serves as a fallback for blocked analytics
// It prevents 404 errors when ad blockers block the real analytics scripts
(function() {
  // Create a mock analytics object that does nothing
  window.va = window.va || function() {};
  
  // Define all potential methods as no-op functions
  const methods = ['track', 'identify', 'page', 'event', 'init'];
  methods.forEach(function(method) {
    window.va[method] = window.va[method] || function() {};
  });
  
  console.debug('Analytics fallback loaded (noop)');
})(); 