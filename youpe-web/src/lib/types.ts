export type VideoItem = {
  id: string;
  title: string;
  thumbnail: string;
  durationSec: number | null;
  durationText: string;
  viewsText: string;
  publishedText: string;
  isLive: boolean;
  author: { id: string; name: string; avatar: string; verified: boolean };
};

export type ChannelItem = {
  id: string;
  name: string;
  avatar: string;
  subsText: string;
  videoCountText: string;
  verified: boolean;
};

export type CommentItem = {
  id: string;
  author: string;
  authorId: string;
  avatar: string;
  text: string;
  published: string;
  likes: string;
  replyCount: number;
  isPinned: boolean;
  isHearted: boolean;
  isOwner: boolean;
};

export type VideoDetail = {
  id: string;
  title: string;
  description: string;
  views: number | null;
  viewsText: string;
  likes: number | null;
  likesText: string;
  publishedText: string;
  isLive: boolean;
  durationSec: number | null;
  keywords: string[];
  channel: {
    id: string;
    name: string;
    avatar: string;
    subsText: string;
    verified: boolean;
  };
  related: VideoItem[];
  manifest: string;
  manifestType: 'dash' | 'hls';
  captions: { label: string; lang: string; url: string }[];
  storyboard: string | null;
};
