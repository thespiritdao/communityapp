/**
 * Props used to get an Onramp buy URL by directly providing a CDP project ID.
 * See https://docs.cdp.coinbase.com/onramp/docs/api-initializing#generating-the-coinbase-onramp-buysell-url
 *
 * Note: exported as public Type
 */
export type GetOnrampUrlWithProjectIdParams = {
  /**
   * The Project ID of your CDP project created at https://portal.cdp.coinbase.com/
   * This must be provided if you don't provide a sessionToken.
   */
  projectId: string;
  sessionToken?: never;
  /**
   * The addresses that the customer's funds should be delivered to.
   *
   * Each entry in the record represents a wallet address and the networks it is valid for. There should only be a
   * single address for each network your app supports. Users will be able to buy/send any asset supported by any of
   * the networks you specify. See the assets param if you want to restrict the avaialable assets.
   *
   * Some common examples:
   *
   * Support all assets that are available for sending on the base network, only on the base network:
   *
   * `{ "0x1": ["base"] }`
   */
  addresses: Record<string, string[]>;
  /**
   * This optional parameter will restrict the assets available for the user to buy/send. It acts as a filter on the
   * networks specified in the {addresses} param.
   *
   * Some common examples:
   *
   * Support only USDC on either the base network or the ethereum network:
   *
   * `addresses: { "0x1": ["base", "ethereum"] }, assets: ["USDC"]`
   *
   * The values in this list can either be asset symbols like BTC, ETH, or asset UUIDs that you can get from the Buy
   * Options API {@link https://docs.cdp.coinbase.com/onramp/docs/api-configurations/#buy-options}.
   */
  assets?: string[];
} & GetOnrampBuyUrlOptionalProps;

/**
 * Props used to get an Onramp buy URL using a session token created using the Onramp session token API.
 * See https://docs.cdp.coinbase.com/onramp/docs/api-initializing#getting-an-coinbase-onramp-buysell-session-token
 *
 * Note: exported as public Type
 */
export type GetOnrampUrlWithSessionTokenParams = {
  /**
   * A session token create using the Onramp session token API. The token will be linked to the project ID, addresses,
   * and assets params provided in the create session token API request.
   */
  sessionToken: string;
  projectId?: never;
  addresses?: never;
  assets?: never;
} & GetOnrampBuyUrlOptionalProps;

/**
 * The optional properties that can be used to create an Onramp buy URL.
 */
type GetOnrampBuyUrlOptionalProps = {
  /**
   * If specified, this asset will be automatically selected for the user in the Onramp UI. Should be a valid asset
   * symbol e.g. BTC, ETH, USDC.
   */
  defaultAsset?: string;
  /**
   * If specified, this network will be automatically selected for the user in the Onramp UI. Should be a valid network
   * name in lower case e.g. ethereum, base.
   */
  defaultNetwork?: string;
  /**
   * A unique identifier that will be associated with any transactions created by the user during their Onramp session.
   * You can use this with the Transaction Status API to check the status of the user's transaction.
   * See https://docs.cdp.coinbase.com/onramp/docs/api-reporting#buy-transaction-status
   */
  partnerUserId?: string;
  /**
   * This amount will be used to pre-fill the amount of crypto the user is buying or sending. The user can choose to
   * change this amount in the UI. Only one of presetCryptoAmount or presetFiatAmount should be provided.
   */
  presetCryptoAmount?: number;
  /**
   * This amount will be used to pre-fill the fiat value of the crypto the user is buying or sending. The user can
   * choose to change this amount in the UI. Only one of presetCryptoAmount or presetFiatAmount should be provided.
   */
  presetFiatAmount?: number;
  /**
   * The currency code of the fiat amount provided in the presetFiatAmount param e.g. USD, CAD, EUR.
   */
  fiatCurrency?: string;
  /**
   * A URL that the user will be automatically redirected to after a successful buy/send. The domain must match a domain
   * on the domain allowlist in Coinbase Developer Platform (https://portal.cdp.coinbase.com/products/onramp).
   */
  redirectUrl?: string;
};

/**
 * Note: exported as public Type
 */
export type FundButtonReact = {
  className?: string; // An optional CSS class name for styling the button component
  disabled?: boolean; // A optional prop to disable the fund button
  text?: string; // An optional text to be displayed in the button component
  hideText?: boolean; // An optional prop to hide the text in the button component
  hideIcon?: boolean; // An optional prop to hide the icon in the button component
  fundingUrl?: string; // An optional prop to provide a custom funding URL
  openIn?: 'popup' | 'tab'; // Whether to open the funding flow in a tab or a popup window
  /**
   * Note: popupSize will be ignored when using a Coinbase Onramp URL (i.e. https://pay.coinbase.com/*) as it requires
   * a fixed popup size.
   */
  popupSize?: 'sm' | 'md' | 'lg'; // Size of the popup window if `openIn` is set to `popup`
  rel?: string; // Specifies the relationship between the current document and the linked document
  target?: string; // Where to open the target if `openIn` is set to tab
};

/**
 * Matches a JSON object.
 * This type can be useful to enforce some input to be JSON-compatible or as a super-type to be extended from. Don't use this as a direct return type as the user would have to double-cast it: `jsonObject as unknown as CustomResponse`. Instead, you could extend your CustomResponse type from it to ensure your type only uses JSON-compatible types: `interface CustomResponse extends JsonObject { … }`.
 * @category JSON
 */
export type JsonObject = { [Key in string]?: JsonValue };

/**
 * Matches a JSON array.
 * @category JSON
 */
export type JsonArray = JsonValue[];

/**
 * Matches any valid JSON primitive value.
 * @category JSON
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Matches any valid JSON value.
 * @see `Jsonify` if you need to transform a type to one that is assignable to `JsonValue`.
 * @category JSON
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type OpenEvent = {
  eventName: 'open';
  widgetName: string;
};

export type TransitionViewEvent = {
  eventName: 'transition_view';
  pageRoute: string;
};

export type PublicErrorEvent = {
  eventName: 'error';
  error: OnRampError;
};

export type ExitEvent = {
  eventName: 'exit';
  error?: OnRampError;
};

export type SuccessEvent = {
  eventName: 'success';
};

export type RequestOpenUrlEvent = {
  eventName: 'request_open_url';
  url: string;
};

export type EventMetadata =
  | OpenEvent
  | TransitionViewEvent
  | PublicErrorEvent
  | ExitEvent
  | SuccessEvent
  | RequestOpenUrlEvent;

export type OnRampError = {
  errorType: 'internal_error' | 'handled_error' | 'network_error';
  code?: string;
  debugMessage?: string;
};
