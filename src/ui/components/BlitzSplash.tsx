import { motion } from 'framer-motion';

export function BlitzSplash({ name }: { name: string }) {
  return (
    <div className="blitz-splash">
      <motion.div initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
        <div className="blitz-word">BLITZ!</div>
        <p style={{ textAlign: 'center', fontWeight: 600 }}>{name}</p>
      </motion.div>
    </div>
  );
}
