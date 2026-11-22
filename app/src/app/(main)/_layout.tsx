import { Tabs } from 'expo-router/js-tabs';
import { Easing } from 'react-native';
import { color } from '../../theme';
import { Icono } from '../../ui';
import { useReducedMotion } from '../../useReducedMotion';

const destinations = [
  { name: 'index', label: 'Inicio', icon: 'home-outline' },
  { name: 'dashboard', label: 'Tablero', icon: 'car-light-alert' },
  { name: 'ask', label: 'Asistente', icon: 'message-text-outline' },
] as const;

export default function MainTabs() {
  const reduced = useReducedMotion();
  return (
    <Tabs backBehavior="initialRoute" screenOptions={{
      headerShown: false, tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: color.fondo },
      tabBarStyle: { backgroundColor: color.fondo, borderTopColor: color.borde },
      tabBarActiveTintColor: color.acento, tabBarInactiveTintColor: color.textoSuave,
      animation: reduced ? 'none' : 'fade',
      transitionSpec: { animation: 'timing', config: { duration: reduced ? 0 : 155, easing: Easing.out(Easing.cubic) } },
      sceneStyleInterpolator: ({ current }) => ({ sceneStyle: {
        opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
        transform: [{ translateY: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [7, 0, -5] }) }],
      } }),
    }}>
      {destinations.map(item => <Tabs.Screen key={item.name} name={item.name} options={{
        title: item.label, tabBarAccessibilityLabel: item.label,
        tabBarIcon: ({ focused }) => <Icono nombre={item.icon} tam={23} tono={focused ? color.acento : color.textoSuave} />,
      }} />)}
    </Tabs>
  );
}
