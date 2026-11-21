import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Image as SvgImage, Path, Polygon, Text as SvgText } from 'react-native-svg';

import { color, radio } from '../theme';
import type { PartId, Volume } from './catalog';

type Camera = { yaw: number; pitch: number; dx: number; dy: number };
type ProjectedPoint = [number, number, number];
export const oblique: Camera = { yaw: -.15, pitch: 1.05, dx: 0, dy: 0 };
export const overhead: Camera = { yaw: 0, pitch: Math.PI / 2, dx: 0, dy: 0 };

type Props = {
  aspectRatio: number;
  volumes: readonly Volume[];
  photoUrl?: string;
  photoVisible: boolean;
  selected: PartId | null;
  camera: Camera;
  setCamera: Dispatch<SetStateAction<Camera>>;
  onPart: (part: PartId) => void;
  onInteraction: (active: boolean) => void;
  onPhotoLoad: () => void;
  onPhotoError: () => void;
};

export function EngineScene(props: Props) {
  const { aspectRatio, volumes, photoUrl, photoVisible, selected, camera, setCamera, onPart, onInteraction, onPhotoLoad, onPhotoError } = props;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      gesture.numberActiveTouches === 1 && Math.hypot(gesture.dx, gesture.dy) > 5,
    onPanResponderGrant: () => {
      setCamera(previous => ({ ...previous, dx: 0, dy: 0 }));
    },
    onPanResponderMove: (_, gesture) => {
      const { dx, dy } = gesture;
      setCamera(previous => ({
        yaw: previous.yaw + (dx - previous.dx) / 130,
        pitch: Math.max(.45, Math.min(Math.PI / 2, previous.pitch + (dy - previous.dy) / 150)),
        dx,
        dy,
      }));
    },
    onPanResponderRelease: () => onInteraction(false),
    onPanResponderTerminate: () => onInteraction(false),
  }), [setCamera, onInteraction]);

  const { width, height } = size;
  const sinYaw = Math.sin(camera.yaw);
  const cosYaw = Math.cos(camera.yaw);
  const sinPitch = Math.sin(camera.pitch);
  const cosPitch = Math.cos(camera.pitch);
  const projectedWidth = Math.abs(cosYaw) + Math.abs(sinYaw) / aspectRatio;
  const projectedHeight = (Math.abs(sinYaw) + Math.abs(cosYaw) / aspectRatio) * sinPitch;
  const scale = Math.min(width * .91 / Math.max(projectedWidth, 1), height * .8 / Math.max(projectedHeight, .72));

  function project([u, v]: readonly [number, number], rise = 0): ProjectedPoint {
    const x = (u - .5) * scale;
    const y = (v - .5) * scale / aspectRatio;
    const depth = x * sinYaw + y * cosYaw;
    return [
      width / 2 + x * cosYaw - y * sinYaw,
      height / 2 + depth * sinPitch - rise * scale * cosPitch,
      depth * cosPitch + rise * scale * sinPitch,
    ];
  }

  const faces: { key: string; part: PartId; depth: number; path: string; side: boolean }[] = [];
  function addFace(part: PartId, points: ProjectedPoint[], index: number, side: boolean) {
    const area = points.reduce((sum, [x, y], i) => {
      const [nextX, nextY] = points[(i + 1) % points.length];
      return sum + x * nextY - y * nextX;
    }, 0);
    if (area <= .001) return;
    const depth = points.reduce((sum, point) => sum + point[2], 0) / points.length;
    const path = 'M' + points.map(([x, y]) => `${x} ${y}`).join('L') + 'Z';
    faces.push({ key: `${part}-${index}`, part, depth, path, side });
  }

  for (const { part, outline, height: rise } of volumes) {
    const base = outline.map(point => project(point));
    const top = outline.map(point => project(point, rise));
    outline.forEach((_, i) => {
      const next = (i + 1) % outline.length;
      addFace(part, [base[i], base[next], top[next], top[i]], i, true);
    });
    addFace(part, top, outline.length, false);
  }
  faces.sort((a, b) => a.depth - b.depth);
  const plane = ([[0, 0], [1, 0], [1, 1], [0, 1]] as const)
    .map(point => project(point).slice(0, 2).join(',')).join(' ');
  const [photoX, photoY] = project([0, 0]);
  const [frontX, frontY] = project([.5, 1]);

  return (
    <View
      style={styles.scene}
      onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}
      onTouchStart={() => onInteraction(true)}
      onTouchEnd={({ nativeEvent }) => {
        if (nativeEvent.touches.length === 0) onInteraction(false);
      }}
      onTouchCancel={() => onInteraction(false)}
      {...pan.panHandlers}
    >
      {photoUrl && !photoVisible && (
        <Image
          accessible={false}
          source={{ uri: photoUrl }}
          onLoad={onPhotoLoad}
          onError={onPhotoError}
          style={styles.photoLoader}
        />
      )}
      <Svg width={width} height={height} accessible={false} importantForAccessibility="no-hide-descendants">
        {photoVisible ? (
          <SvgImage
            href={photoUrl}
            width={scale}
            height={scale / aspectRatio}
            preserveAspectRatio="none"
            transform={[cosYaw, sinYaw * sinPitch, -sinYaw, cosYaw * sinPitch, photoX, photoY]}
          />
        ) : (
          <>
            <Polygon points={plane} fill={color.superficieAlta} stroke={color.borde} strokeWidth={1} />
            <SvgText x={frontX} y={frontY + 16} fill={color.textoSuave} fontSize={11} textAnchor="middle">
              Frente del vehículo
            </SvgText>
          </>
        )}
        {faces.map(face => (
          <Path
            key={face.key}
            d={face.path}
            fill={face.part === selected ? color.acento : color.exito}
            fillOpacity={face.side ? .4 : .66}
            stroke={face.part === selected ? color.acento : color.exito}
            strokeWidth={face.part === selected ? 1.5 : .8}
            onPress={() => onPart(face.part)}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    aspectRatio: 1.28,
    backgroundColor: color.fondo,
    borderColor: color.borde,
    borderWidth: 1,
    borderRadius: radio.l,
    overflow: 'hidden',
  },
  photoLoader: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
