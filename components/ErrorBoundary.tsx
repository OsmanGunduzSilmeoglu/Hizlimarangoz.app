import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Modül seviyesinde hata sınırı (ARCH-07): tek bozuk kayıt ya da beklenmeyen
 * bir hata artık tüm uygulamayı beyaz ekrana düşürmez.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('Modül hatası:', error, info);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-500/20 rounded-3xl p-8 text-center my-8">
          <h3 className="font-black text-red-600 text-lg mb-2">Bir şeyler ters gitti</h3>
          <p className="text-sm text-red-900/60 mb-1">
            Bu modül beklenmeyen bir hatayla karşılaştı. Diğer modüller çalışmaya devam ediyor.
          </p>
          <p className="text-xs text-red-900/40 font-mono mb-6 break-all">{this.state.message}</p>
          <button
            onClick={this.reset}
            className="bg-red-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-red-700 transition-colors text-sm shadow-sm"
          >
            Tekrar Dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
