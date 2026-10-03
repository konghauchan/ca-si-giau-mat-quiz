'use client';
import { AVATARS } from '@/lib/playerAppearance';
import { PlayerAvatar } from './PlayerAvatar';

export function AvatarPicker({ value, onChange }: { value: number; onChange: (id: number) => void }) {
  return <fieldset className="avatar-picker"><legend>Chọn avatar của bạn</legend><div className="avatar-grid">{AVATARS.map((avatar, index) => <button key={avatar.name} type="button" className={`avatar-choice ${value === index + 1 ? 'selected' : ''}`} aria-label={`Chọn avatar ${avatar.name}`} aria-pressed={value === index + 1} title={avatar.name} onClick={() => onChange(index + 1)}><PlayerAvatar id={index + 1} size={52} /><span>{avatar.name}</span></button>)}</div></fieldset>;
}
