export const AVATARS = [
  { name: 'Mắt Lồi', main: '#ff9ab5', accent: '#f15b85', backdrop: '#ffe0e9' },
  { name: 'Ếch Đại Ca', main: '#8cdf79', accent: '#5cae54', backdrop: '#d5f7aa' },
  { name: 'Não Hồng', main: '#f9a6bf', accent: '#e36e9d', backdrop: '#fcd6e5' },
  { name: 'Mèo Quạo', main: '#f5b269', accent: '#db7e3d', backdrop: '#ffe0b2' },
  { name: 'Bánh Rán', main: '#cb8e58', accent: '#f58db4', backdrop: '#f9dab0' },
  { name: 'Trứng Ốp', main: '#fff3ca', accent: '#ffc84e', backdrop: '#d8eaff' },
  { name: 'Dưa Chuột', main: '#8bcf69', accent: '#5da647', backdrop: '#e1f5bb' },
  { name: 'Robot Lỗi', main: '#8ac6e8', accent: '#526dc0', backdrop: '#cce3fa' },
  { name: 'Cá Mập', main: '#9dc2d4', accent: '#617f9e', backdrop: '#cceaf0' },
  { name: 'Nấm Đỏ', main: '#f6dab1', accent: '#f36969', backdrop: '#e8d8ff' },
  { name: 'Vịt Ngáo', main: '#ffe477', accent: '#f69b49', backdrop: '#c8eff4' },
  { name: 'Mặt Trăng', main: '#f6e4a5', accent: '#d0ad64', backdrop: '#b9b9f2' },
  { name: 'Bóng Ma', main: '#e7edff', accent: '#b6bde9', backdrop: '#d6c7f6' },
  { name: 'Gà Chiến', main: '#fff0cb', accent: '#ed745d', backdrop: '#f9d2b8' },
  { name: 'Quái Ba Mắt', main: '#a690ef', accent: '#7b63c9', backdrop: '#dfd2ff' },
  { name: 'Ninja Ngủ', main: '#494c77', accent: '#f8b2c9', backdrop: '#d9d3f5' },
  { name: 'Cua Cọc', main: '#ff8d75', accent: '#dc5c57', backdrop: '#ffd1b5' },
  { name: 'Bắp Rang', main: '#fff2bc', accent: '#ed6165', backdrop: '#ffe1a6' },
  { name: 'Chú Hề', main: '#ffcf9b', accent: '#f46e85', backdrop: '#d3e4fd' },
  { name: 'Khủng Long', main: '#7bd3ae', accent: '#39a77a', backdrop: '#c7f5d4' },
] as const;

export const PLAYER_COLORS = ['#ff6d83', '#55d5ea', '#f6c354', '#b9a0ff'] as const;
export function avatarId(value: number) { return Number.isInteger(value) && value >= 1 && value <= AVATARS.length ? value : 1; }
