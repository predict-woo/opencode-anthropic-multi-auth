/** @jsxImportSource hono/jsx */

export function FormAlert(props: {
  message?: string
  color?: "danger" | "success"
}) {
  return (
    <div data-component="form-alert" data-color={props.color}>
      <svg
        data-slot="icon"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-6"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>
      <span data-slot="message">{props.message}</span>
    </div>
  )
}
