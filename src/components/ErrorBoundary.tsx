import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Atrapa errores inesperados de React para que el usuario nunca vea una
 * pantalla en blanco: muestra un mensaje amigable con boton de recarga.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Error no controlado en la app:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-yayis-cream p-6">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
            <h1 className="text-xl font-bold text-yayis-dark mb-2">Algo salio mal</h1>
            <p className="text-sm text-gray-600 mb-6">
              Ocurrio un error inesperado. Tus datos estan seguros — recarga la pagina para continuar.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-md bg-yayis-green px-6 py-2 text-sm font-medium text-white hover:bg-yayis-green/90"
            >
              Recargar la pagina
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
