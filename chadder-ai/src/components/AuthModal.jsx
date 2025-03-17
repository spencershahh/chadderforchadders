import { Dialog } from '@headlessui/react';
import styles from './AuthModal.module.css';

const AuthModal = ({ show, isOpen, onClose, onLogin, onSignup }) => {
  // Use show prop or fallback to isOpen for backward compatibility
  const dialogOpen = show !== undefined ? show : isOpen;
  
  return (
    <Dialog open={dialogOpen} onClose={onClose} className={styles.modalOverlay}>
      <div className={styles.modalContainer}>
        <Dialog.Panel className={styles.modalContent}>
          <Dialog.Title className={styles.modalTitle}>
            Join Chadder.ai
          </Dialog.Title>
          <Dialog.Description className={styles.modalDescription}>
            Create an account or log in to purchase credits and support your favorite streamers
          </Dialog.Description>
          
          <div className={styles.buttonContainer}>
            <button 
              onClick={onSignup}
              className={`${styles.authButton} ${styles.signupButton}`}
            >
              Create Account
            </button>
            <button 
              onClick={onLogin}
              className={`${styles.authButton} ${styles.loginButton}`}
            >
              Log In
            </button>
          </div>

          <button 
            onClick={onClose}
            className={styles.closeButton}
          >
            ✕
          </button>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default AuthModal; 