import { createApp, type Plugin } from 'vue';
import { createHead } from '@unhead/vue/client';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
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
import Toast from 'primevue/toast';
import ToastService from 'primevue/toastservice';
import ToggleSwitch from 'primevue/toggleswitch';
import App from './App.vue';
import './assets/main.css';
import router from './router';
import { authenticationActor } from './actors/authenticationActor';
import { accountActor } from './views/account/actors/account.actor';

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

app.use(router);

authenticationActor.start();
accountActor.start();

app.mount('#app');
