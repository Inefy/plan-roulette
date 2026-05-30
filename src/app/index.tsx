// src/app/index.tsx
import { Redirect } from 'expo-router';

export default function IndexRoute() {
  return <Redirect href="/tabs/home" />;
}
