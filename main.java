import java.util.Scanner;

public class main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Digite seu nome: ");
        String nome = scanner.nextLine();

        System.out.print("Digite um numero de 1 a 50: ");
        
        if (scanner.hasNextInt()) {
            int numero = scanner.nextInt();

            System.out.println("Muito prazer, " + nome);

            if (numero == 24) {
                System.out.println("viado");
            } else {
                System.out.println("hetero");
            }
        } else {
            System.out.println("Você não digitou um número válido!");
        }

        scanner.close();
    }
}