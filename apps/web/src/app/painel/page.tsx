import { Suspense } from 'react';
import { AgendaDoDia } from './agenda-do-dia';

export default function Page() {
  return (
    <Suspense>
      <AgendaDoDia />
    </Suspense>
  );
}
