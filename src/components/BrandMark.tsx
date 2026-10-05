import Image from 'next/image';
export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><Image src="/do-nhac-logo.svg" width={40} height={40} alt="" priority /></span>;
}
