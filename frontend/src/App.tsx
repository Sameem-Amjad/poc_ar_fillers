import { useState } from 'react';
import { Splash } from './pages/Splash';
import { CameraPage } from './pages/Camera';
import { SavedPage } from './pages/Saved';

type Page = 'splash' | 'camera' | 'saved';

function App() {
  const [page, setPage] = useState<Page>('splash');

  return (
    <div className="w-full h-full">
      {page === 'splash' && (
        <Splash onStart={() => setPage('camera')} />
      )}
      {page === 'camera' && (
        <CameraPage onViewSessions={() => setPage('saved')} />
      )}
      {page === 'saved' && (
        <SavedPage onBack={() => setPage('camera')} />
      )}
    </div>
  );
}

export default App;
