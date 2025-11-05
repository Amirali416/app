class Button extends Container {
  constructor({
    text = 'Button',
    size = 48,
    type = 'rounded',
    onClick = null,
    warp = false,
    tintOpacity = 0.2
  } = {}) {
    super({ borderRadius: size * 0.4, type, tintOpacity })
    
    this.text = text
    this.size = size
    this.onClick = onClick
    this.warp = warp
    
    this.setupButton()
  }

  setupButton() {
    this.element.classList.add('glass-button')
    this.element.classList.add(`glass-button-${this.type}`)
    
    const textElement = document.createElement('div')
    textElement.className = 'glass-button-text'
    textElement.textContent = this.text
    textElement.style.fontSize = `${this.size}px`
    
    this.textElement = textElement
    this.element.appendChild(textElement)
    
    // Auto-sizing based on type
    if (this.type === 'circle') {
      const diameter = this.size * 2.5
      this.element.style.width = `${diameter}px`
      this.element.style.height = `${diameter}px`
    } else if (this.type === 'pill') {
      this.element.style.padding = `${this.size * 0.4}px ${this.size * 0.8}px`
    } else {
      this.element.style.padding = `${this.size * 0.3}px ${this.size * 0.6}px`
    }
    
    // Event listeners
    if (this.onClick) {
      this.element.addEventListener('click', () => {
        this.onClick(this.text)
      })
    }
    
    this.element.addEventListener('mouseenter', () => {
      this.element.style.transform = 'scale(1.05)'
    })
    
    this.element.addEventListener('mouseleave', () => {
      this.element.style.transform = 'scale(1)'
    })
  }

  setText(newText) {
    this.text = newText
    if (this.textElement) {
      this.textElement.textContent = newText
    }
  }
}
