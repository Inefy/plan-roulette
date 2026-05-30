// src/app/create/_layout.tsx
import { Stack } from 'expo-router';

import { CreatePlanProvider } from '../../features/create/CreatePlanProvider';

export default function CreateLayout() {
  return (
    <CreatePlanProvider>
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
        }}
      />
    </CreatePlanProvider>
  );
}
