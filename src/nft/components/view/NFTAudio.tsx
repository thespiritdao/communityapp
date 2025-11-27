import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { background, cn } from '../../../styles/theme';
import type { NFTError } from '../../types';
import { useNFTContext } from '../NFTProvider';

type NFTAudioReact = {
  className?: string;
  onLoading?: (mediaUrl: string) => void;
  onLoaded?: () => void;
  onError?: (error: NFTError) => void;
};

export function NFTAudio({
  className,
  onLoading,
  onLoaded,
  onError,
}: NFTAudioReact) {
  const { animationUrl } = useNFTContext();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    function onEnded() {
      setIsPlaying(false);
    }

    if (animationUrl && audioRef?.current) {
      audioRef.current.onloadstart = () => {
        onLoading?.(animationUrl);
      };

      audioRef.current.onloadeddata = () => {
        onLoaded?.();
      };

      audioRef.current.addEventListener('ended', onEnded);

      audioRef.current.onerror = (error: string | Event) => {
        onError?.({
          error: typeof error === 'string' ? error : error.type,
          code: 'NmNAc01', // NFT module NFTAudio component 01 error
          message: 'Error loading audio',
        });
      };
    }
  }, [animationUrl, onLoading, onLoaded, onError]);

  const handlePlayPause = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    },
    [isPlaying],
  );

  if (!animationUrl) {
    return null;
  }

  return (
    <div className={cn('max-h-350 w-350 max-w-350', className)}>
      <button
        type="button"
        className={cn(
          background.reverse,
          'ml-6 inline-flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-full',
        )}
        onClick={handlePlayPause}
      >
        <div
          className={cn(
            'ml-px box-border h-[18px] transition-all duration-100 ease-linear',
            'border-transparent',
          )}
          style={{
            borderLeft: isPlaying
              ? '16px double var(--ock-bg-default)'
              : '16px solid var(--ock-bg-default)',
            borderTop: isPlaying ? '0' : '9px solid transparent',
            borderBottom: isPlaying ? '0' : '9px solid transparent',
            marginRight: isPlaying ? '0' : '-1px',
          }}
        />
      </button>
      <audio
        ref={audioRef}
        data-testid="ockNFTAudio"
        autoPlay={false}
        controls={false}
        src={animationUrl}
      >
        <track kind="captions" />
      </audio>
    </div>
  );
}
