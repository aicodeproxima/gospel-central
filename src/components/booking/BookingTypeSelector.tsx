'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BookingType, BOOKING_TYPE_CONFIG } from '@/lib/types';
import {
  UserPlus, Shield, Video, Users, Monitor, UsersRound, Star,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ICONS: Record<string, React.ElementType> = {
  UserPlus, Shield, Video, Users, Monitor, UsersRound, Star,
};

interface BookingTypeSelectorProps {
  value: BookingType | null;
  onChange: (type: BookingType) => void;
}

export function BookingTypeSelector({ value, onChange }: BookingTypeSelectorProps) {
  const types = Object.entries(BOOKING_TYPE_CONFIG) as [BookingType, typeof BOOKING_TYPE_CONFIG[BookingType]][];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {types.map(([type, config]) => {
        const Icon = ICONS[config.icon] as React.ComponentType<{ className?: string }>;
        const isSelected = value === type;
        const isTeam = type === BookingType.TEAM_ACTIVITIES;

        return (
          <motion.button
            key={type}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(type)}
            className={cn(
              'relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all touch-manipulation',
              isSelected
                ? 'border-primary bg-primary/10 shadow-md'
                : 'border-border hover:border-primary/40 hover:bg-accent/50',
              isTeam && !isSelected && 'border-amber-500/30 bg-amber-500/5'
            )}
          >
            {isTeam && (
              <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px]">
                Featured
              </Badge>
            )}
            <div className={cn(
              'rounded-lg p-2.5',
              isSelected ? 'bg-primary text-primary-foreground' : 'bg-accent'
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium leading-tight">{config.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
