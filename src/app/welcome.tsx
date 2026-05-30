// src/app/welcome.tsx
import { Redirect } from 'expo-router';

export default function WelcomeRoute() {
  return <Redirect href="/tabs/home" />;
}
