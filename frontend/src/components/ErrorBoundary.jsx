import { Component } from 'react';

/**
 * React Error Boundary
 * 捕捉子元件的 render / lifecycle 錯誤，顯示友善訊息而非白屏
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', minHeight: 200,
        color: '#9ca3af', padding: 32, textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f87171', marginBottom: 8 }}>
          此區塊發生錯誤
        </div>
        <div style={{ fontSize: 13, marginBottom: 16, maxWidth: 400 }}>
          {this.state.error?.message || '未知錯誤'}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            padding: '6px 16px', background: '#374151', border: '1px solid #4b5563',
            borderRadius: 6, color: '#e5e7eb', cursor: 'pointer', fontSize: 13,
          }}
        >
          重試
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
