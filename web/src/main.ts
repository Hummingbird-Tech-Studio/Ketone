import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
import { createHead } from '@unhead/vue/client';
import 'primeicons/primeicons.css';
import Button from 'primevue/button';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ConfirmDialog from 'primevue/confirmdialog';
import DatePicker from 'primevue/datepicker';
import Dialog from 'primevue/dialog';
import Divider from 'primevue/divider';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Menu from 'primevue/menu';
import Message from 'primevue/message';
import Password from 'primevue/password';
import ProgressSpinner from 'primevue/progressspinner';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Skeleton from 'primevue/skeleton';
import Textarea from 'primevue/textarea';
import Toast from 'primevue/toast';
import ToastService from 'primevue/toastservice';
import ToggleSwitch from 'primevue/toggleswitch';
import Tooltip from 'primevue/tooltip';
import { configure } from 'vee-validate';
import { createApp, type Plugin } from 'vue';
import { authenticationActor } from './actors/authenticationActor';
import { versionCheckerActor } from './actors/versionCheckerActor';
import App from './App.vue';
import './assets/main.css';
import router from './router';
import { FASTING_COMPLETE_NOTIFICATION_ID } from './services/local-notifications';
import { accountActor } from './views/account/actors/account.actor';

configure({
  validateOnInput: false,
  validateOnModelUpdate: true,
});

const CustomPreset = definePreset(Aura, {
  components: {
    button: {
      // Adjust button width and height for icon-only rounded buttons
      // iconOnlyWidth: '32px',
      // iconOnlyHeight: '32px',
      // iconFontSize: '15px',
    },
    inputtext: {
      colorScheme: {
        light: {
          root: {
            border: '1px solid var(--p-gray-500)',
            hoverBorderColor: 'var(--p-gray-500)',
            focusBorderColor: 'var(--p-gray-500)',
          },
        },
        dark: {
          root: {
            border: '1px solid var(--p-gray-500)',
            hoverBorderColor: 'var(--p-gray-500)',
            focusBorderColor: 'var(--p-gray-500)',
          },
        },
      },
    },
    password: {
      colorScheme: {
        light: {
          root: {
            border: '1px solid var(--p-gray-500)',
          },
        },
      },
    },
  },
});

const app = createApp(App);
const head = createHead();
app.use(head);
app.use(PrimeVue, { theme: { preset: CustomPreset } });
app.use(ConfirmationService as unknown as Plugin); // TODO: This should be fixed in the next version of PrimeVue
app.use(ToastService as unknown as Plugin); // TODO: This should be fixed in the next version of PrimeVue
app.component('Button', Button);
app.component('Menu', Menu);
app.component('InputText', InputText);
app.component('Password', Password);
app.component('Message', Message);
app.component('Select', Select);
app.component('InputNumber', InputNumber);
app.component('Divider', Divider);
app.component('ToggleSwitch', ToggleSwitch);
app.component('Dialog', Dialog);
app.component('ConfirmDialog', ConfirmDialog);
app.component('Toast', Toast);
app.component('SelectButton', SelectButton);
app.component('DatePicker', DatePicker);
app.component('ProgressSpinner', ProgressSpinner);
app.component('Skeleton', Skeleton);
app.component('Textarea', Textarea);
app.directive('tooltip', Tooltip);

app.use(router);

// Add platform class to body for platform-specific styles
if (Capacitor.isNativePlatform()) {
  document.body.classList.add('native-platform');
  document.body.classList.add(`platform-${Capacitor.getPlatform()}`);

  // Handle Android back button
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
  });

  // Navigate to /cycle when fasting notification is tapped
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    if (action.notification.id === FASTING_COMPLETE_NOTIFICATION_ID) {
      router.push('/cycle');
    }
  });
}

authenticationActor.start();
accountActor.start();
versionCheckerActor.start();

app.mount('#app');
