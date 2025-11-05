/* Particles.js Configuration and Animation */

(function() {
  function initParticles() {
    const particlesContainer = document.getElementById('particles-js');
    if (!particlesContainer) return;
    
    if (typeof particlesJS === 'undefined') {
      initFallbackParticles();
      return;
    }
    
    try {
      particlesJS('particles-js', {
        particles: {
          number: {
            value: 100,
            density: {
              enable: true,
              value_area: 800
            }
          },
          color: {
            value: ['#7C4DFF', '#FF6B9D', '#00E5FF', '#FFD740', '#69F0AE', '#FF5252']
          },
          shape: {
            type: 'circle',
            stroke: {
              width: 0,
              color: '#000000'
            }
          },
          opacity: {
            value: 0.7,
            random: true,
            anim: {
              enable: true,
              speed: 1,
              opacity_min: 0.3,
              sync: false
            }
          },
          size: {
            value: 5,
            random: true,
            anim: {
              enable: true,
              speed: 3,
              size_min: 1,
              sync: false
            }
          },
          line_linked: {
            enable: true,
            distance: 150,
            color: '#7C4DFF',
            opacity: 0.5,
            width: 1.5
          },
          move: {
            enable: true,
            speed: 2.5,
            direction: 'none',
            random: true,
            straight: false,
            out_mode: 'out',
            bounce: false,
            attract: {
              enable: true,
              rotateX: 600,
              rotateY: 1200
            }
          }
        },
        interactivity: {
          detect_on: 'canvas',
          events: {
            onhover: {
              enable: true,
              mode: 'grab'
            },
            onclick: {
              enable: false, // Disable built-in onclick to use our custom handler
              mode: 'push'
            },
            resize: true
          },
          modes: {
            grab: {
              distance: 180,
              line_linked: {
                opacity: 0.6
              }
            },
            push: {
              particles_nb: 4
            },
            repulse: {
              distance: 100,
              duration: 0.4
            }
          }
        },
        retina_detect: true
      });
      
      // Add touch support after initialization
      setTimeout(() => addTouchSupport(), 300);
    } catch (error) {
      console.error('Error initializing particles:', error);
      initFallbackParticles();
    }
  }
  
  // Add touch and click support
  function addTouchSupport() {
    const canvas = document.querySelector('#particles-js canvas');
    if (!canvas) {
      setTimeout(() => addTouchSupport(), 200);
      return;
    }
    
    // Fade out animation loop
    function animateFadeOut() {
      if (window.pJSDom && window.pJSDom[0] && window.pJSDom[0].pJS.particles.array) {
        const now = Date.now();
        window.pJSDom[0].pJS.particles.array = window.pJSDom[0].pJS.particles.array.filter(particle => {
          if (particle.fadeOut) {
            const elapsed = now - particle.fadeOutStart;
            if (elapsed >= particle.fadeOutDuration) {
              return false; // Remove particle
            }
            // Update opacity for smooth fade effect
            const progress = elapsed / particle.fadeOutDuration;
            particle.opacity.value = particle.initialOpacity * (1 - progress);
          }
          return true;
        });
      }
      requestAnimationFrame(animateFadeOut);
    }
    
    // Start animation loop
    animateFadeOut();
    
    // Spawn particles function
    function spawnParticlesAt(x, y) {
      if (!window.pJSDom || !window.pJSDom[0] || !window.pJSDom[0].pJS.particles.array) return;
      
      const particlesNb = window.pJSDom[0].pJS.interactivity.modes.push.particles_nb || 4;
      
      for (let i = 0; i < particlesNb; i++) {
        const newParticle = new window.pJSDom[0].pJS.fn.particle(
          window.pJSDom[0].pJS.particles.color,
          window.pJSDom[0].pJS.particles.opacity.value,
          {
            x: x + (Math.random() - 0.5) * 40,
            y: y + (Math.random() - 0.5) * 40
          }
        );
        
        // Mark particle for fade out animation
        newParticle.fadeOut = true;
        newParticle.fadeOutDuration = 3000; // 3 seconds
        newParticle.fadeOutStart = Date.now();
        newParticle.initialOpacity = newParticle.opacity.value;
        
        window.pJSDom[0].pJS.particles.array.push(newParticle);
      }
    }
    
    // Touch events
    canvas.addEventListener('touchstart', function(e) {
      if (!window.pJSDom || !window.pJSDom[0]) return;
      
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      // Simulate hover/grab effect
      if (window.pJSDom[0].pJS.interactivity.modes.grab) {
        window.pJSDom[0].pJS.interactivity.mouse.pos_x = x;
        window.pJSDom[0].pJS.interactivity.mouse.pos_y = y;
        window.pJSDom[0].pJS.interactivity.status = 'mousemove';
      }
      
      e.preventDefault();
    }, { passive: false });
    
    canvas.addEventListener('touchmove', function(e) {
      if (!window.pJSDom || !window.pJSDom[0]) return;
      
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      // Update particle interaction position
      window.pJSDom[0].pJS.interactivity.mouse.pos_x = x;
      window.pJSDom[0].pJS.interactivity.mouse.pos_y = y;
      
      e.preventDefault();
    }, { passive: false });
    
    // Touch end to spawn particles
    canvas.addEventListener('touchend', function(e) {
      if (!window.pJSDom || !window.pJSDom[0]) return;
      
      const touch = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      spawnParticlesAt(x, y);
      
      // Reset mouse position
      window.pJSDom[0].pJS.interactivity.mouse.pos_x = null;
      window.pJSDom[0].pJS.interactivity.mouse.pos_y = null;
      window.pJSDom[0].pJS.interactivity.status = 'mouseout';
      
      e.preventDefault();
    }, { passive: false });
    
    // Mouse click events
    canvas.addEventListener('mousedown', function(e) {
      const rect = canvas.getBoundingClientRect();
      spawnParticlesAt(e.clientX - rect.left, e.clientY - rect.top);
      e.stopPropagation();
    });
    
    canvas.addEventListener('click', function(e) {
      const rect = canvas.getBoundingClientRect();
      spawnParticlesAt(e.clientX - rect.left, e.clientY - rect.top);
    });
  }
  
  // Update particle colors based on theme
  function updateParticleColors() {
    if (!window.pJSDom || !window.pJSDom[0]) return;
    
    const body = document.body;
    let colors = [];
    let lineColor = '';
    
    if (body.classList.contains('theme-beige')) {
      // Warm colors for beige theme
      colors = ['#f59e0b', '#d97706', '#b45309', '#fbbf24', '#fb923c', '#ea580c'];
      lineColor = '#d97706';
    } else if (body.classList.contains('theme-modern')) {
      // Purple colors for modern theme
      colors = ['#7C4DFF', '#FF6B9D', '#00E5FF', '#FFD740', '#69F0AE', '#FF5252'];
      lineColor = '#7C4DFF';
    } else {
      return; // Other themes don't show particles
    }
    
    // Update particle colors
    if (window.pJSDom[0].pJS.particles.array) {
      window.pJSDom[0].pJS.particles.array.forEach(particle => {
        particle.color.value = colors[Math.floor(Math.random() * colors.length)];
      });
    }
    
    // Update line color
    if (window.pJSDom[0].pJS.particles.line_linked) {
      window.pJSDom[0].pJS.particles.line_linked.color_rgb_line = hexToRgb(lineColor);
    }
  }
  
  // Convert hex to RGB
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  // Listen for theme changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        updateParticleColors();
      }
    });
  });
  
  // Start observing body class changes
  if (document.body) {
    observer.observe(document.body, { attributes: true });
  }
  
  // Try to initialize immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initParticles);
  } else {
    // DOM is already ready, initialize now
    initParticles();
  }
})();

// Fallback manual particle system
function initFallbackParticles() {
  const canvas = document.createElement('canvas');
  canvas.id = 'fallback-particles';
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  
  const particlesContainer = document.getElementById('particles-js');
  if (particlesContainer) {
    particlesContainer.appendChild(canvas);
    new ManualParticleSystem(canvas);
  }
}

class ManualParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.particleCount = 100;
    this.colors = ['#7C4DFF', '#FF6B9D', '#00E5FF', '#FFD740', '#69F0AE', '#FF5252'];
    this.mouse = { x: null, y: null, radius: 150 };
    
    this.resize();
    this.init();
    this.animate();
    
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
  }
  
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  
  init() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 2.5,
        vy: (Math.random() - 0.5) * 2.5,
        radius: Math.random() * 4 + 1,
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
        opacity: Math.random() * 0.5 + 0.3
      });
    }
  }
  
  drawParticle(particle) {
    this.ctx.beginPath();
    this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    this.ctx.fillStyle = particle.color;
    this.ctx.globalAlpha = particle.opacity;
    this.ctx.fill();
    this.ctx.globalAlpha = 1;
  }
  
  drawLine(p1, p2, distance) {
    const opacity = Math.max(0, 1 - distance / 150);
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.strokeStyle = '#7C4DFF';
    this.ctx.globalAlpha = opacity * 0.5;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }
  
  update() {
    for (let particle of this.particles) {
      // Mouse interaction
      if (this.mouse.x !== null && this.mouse.y !== null) {
        const dx = this.mouse.x - particle.x;
        const dy = this.mouse.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < this.mouse.radius) {
          const force = (this.mouse.radius - distance) / this.mouse.radius;
          const angle = Math.atan2(dy, dx);
          particle.vx -= Math.cos(angle) * force * 0.5;
          particle.vy -= Math.sin(angle) * force * 0.5;
        }
      }
      
      particle.x += particle.vx;
      particle.y += particle.vy;
      
      // Bounce off edges
      if (particle.x < 0 || particle.x > this.canvas.width) {
        particle.vx *= -1;
        particle.x = Math.max(0, Math.min(this.canvas.width, particle.x));
      }
      if (particle.y < 0 || particle.y > this.canvas.height) {
        particle.vy *= -1;
        particle.y = Math.max(0, Math.min(this.canvas.height, particle.y));
      }
      
      // Damping
      particle.vx *= 0.99;
      particle.vy *= 0.99;
    }
  }
  
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw connections
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const dx = this.particles[i].x - this.particles[j].x;
        const dy = this.particles[i].y - this.particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 150) {
          this.drawLine(this.particles[i], this.particles[j], distance);
        }
      }
      
      // Draw mouse connections
      if (this.mouse.x !== null && this.mouse.y !== null) {
        const dx = this.mouse.x - this.particles[i].x;
        const dy = this.mouse.y - this.particles[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < this.mouse.radius) {
          this.ctx.beginPath();
          this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
          this.ctx.lineTo(this.mouse.x, this.mouse.y);
          this.ctx.strokeStyle = '#7C4DFF';
          this.ctx.globalAlpha = (1 - distance / this.mouse.radius) * 0.7;
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();
          this.ctx.globalAlpha = 1;
        }
      }
    }
    
    // Draw particles
    for (let particle of this.particles) {
      this.drawParticle(particle);
    }
  }
  
  animate() {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
}
