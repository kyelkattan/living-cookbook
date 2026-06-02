const W = '#FFFFFF';   // white (hat, coat)
const C = '#FFCC99';   // skin
const E = '#1a0800';   // eyes / dark
const M = '#DD4422';   // mouth
const Y = '#FFD700';   // buttons / gold
const G = '#909090';   // pot grey
const GL= '#C8C8C8';   // pot highlight
const B = '#222222';   // stove
const O = '#FF8800';   // fire / steam orange
const R = '#FF4400';   // fire red
const _ = null;

// 14 cols × 26 rows
const PIXELS = [
  [_,_,_,_,W,W,W,W,W,W,_,_,_,_],
  [_,_,_,_,W,W,W,W,W,W,_,_,_,_],
  [_,_,_,_,W,W,W,W,W,W,_,_,_,_],
  [_,_,_,_,W,W,W,W,W,W,_,_,_,_],
  [_,_,W,W,W,W,W,W,W,W,W,W,_,_],
  [_,_,_,_,C,C,C,C,C,C,_,_,_,_],
  [_,_,_,C,C,E,C,C,E,C,C,_,_,_],
  [_,_,_,C,C,C,C,C,C,C,C,_,_,_],
  [_,_,_,C,C,C,M,M,C,C,C,_,_,_],
  [_,_,_,_,C,C,C,C,C,C,_,_,_,_],
  [_,_,W,W,W,W,W,W,W,W,W,W,_,_],
  [_,W,W,Y,W,W,W,W,W,W,Y,W,W,_],
  [_,W,W,W,W,W,W,W,W,W,W,W,W,_],
  [_,_,W,W,W,W,W,W,W,W,W,W,_,_],
  [_,_,W,W,_,G,G,G,G,_,W,W,_,_],
  [_,_,_,_,G,G,GL,GL,G,G,_,_,_,_],
  [_,_,_,G,G,G,GL,GL,G,G,G,_,_,_],
  [_,_,_,G,G,O,O,O,O,G,G,_,_,_],
  [_,_,_,G,G,G,G,G,G,G,G,_,_,_],
  [_,_,_,_,B,B,B,B,B,B,_,_,_,_],
  [_,_,O,_,_,O,_,O,_,_,O,_,_,_],
  [_,O,_,_,O,_,_,_,O,_,_,O,_,_],
  [O,_,_,O,_,_,R,_,_,R,_,_,O,_],
  [R,R,_,_,R,R,R,R,R,R,_,R,R,R],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
];

const SIZE = 8;

export default function PixelChef() {
  return (
    <div style={{ display: 'inline-block', imageRendering: 'pixelated', lineHeight: 0 }}>
      {PIXELS.map((row, y) => (
        <div key={y} style={{ display: 'flex' }}>
          {row.map((color, x) => (
            <div key={x} style={{
              width: SIZE,
              height: SIZE,
              backgroundColor: color ?? 'transparent',
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}
